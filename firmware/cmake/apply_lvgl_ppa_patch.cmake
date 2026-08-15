# LVGL 9.5.0's experimental PPA backend needs two fixes on ESP32-P4:
#
# - It passes draw_buf->data_size to esp_cache_msync() and PPA. Dynamically
#   allocated draw buffers align their address, but not their size, which
#   violates the cache-line contract.
# - Its cache handler synchronizes the whole draw buffer for every fill or
#   image blit. With LVGL rendering directly into a full-screen frame buffer
#   that is a multi-megabyte write-back twice per operation; only the rows the
#   operation touches need it.
#
# Keep these workarounds version-pinned so an LVGL update cannot silently
# receive a stale patch.
set(_simcore_lvgl_dir "${CMAKE_CURRENT_LIST_DIR}/../managed_components/lvgl__lvgl")
set(_simcore_lvgl_version_header "${_simcore_lvgl_dir}/lv_version.h")
set(_simcore_lvgl_patches
    "${CMAKE_CURRENT_LIST_DIR}/../patches/lvgl-9.5.0-ppa-draw-buffer-size-alignment.patch"
    "${CMAKE_CURRENT_LIST_DIR}/../patches/lvgl-9.5.0-ppa-area-cache-sync.patch")
set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS ${_simcore_lvgl_patches})

if(NOT EXISTS "${_simcore_lvgl_version_header}")
    message(FATAL_ERROR
        "LVGL managed component was not resolved before applying the ESP32-P4 PPA patches")
endif()

file(READ "${_simcore_lvgl_version_header}" _simcore_lvgl_version)
foreach(_simcore_version_part IN ITEMS
        "LVGL_VERSION_MAJOR 9"
        "LVGL_VERSION_MINOR 5"
        "LVGL_VERSION_PATCH 0")
    string(FIND "${_simcore_lvgl_version}" "${_simcore_version_part}" _simcore_version_match)
    if(_simcore_version_match EQUAL -1)
        message(FATAL_ERROR
            "The ESP32-P4 PPA patches support only LVGL 9.5.0. "
            "Review or remove them under firmware/patches before building this LVGL version.")
    endif()
endforeach()

find_package(Git REQUIRED)

foreach(_simcore_lvgl_patch IN LISTS _simcore_lvgl_patches)
    get_filename_component(_simcore_patch_name "${_simcore_lvgl_patch}" NAME)
    execute_process(
        COMMAND "${GIT_EXECUTABLE}" apply --check "${_simcore_lvgl_patch}"
        WORKING_DIRECTORY "${CMAKE_CURRENT_LIST_DIR}/../.."
        RESULT_VARIABLE _simcore_patch_can_apply
        OUTPUT_QUIET
        ERROR_QUIET)

    if(_simcore_patch_can_apply EQUAL 0)
        execute_process(
            COMMAND "${GIT_EXECUTABLE}" apply "${_simcore_lvgl_patch}"
            WORKING_DIRECTORY "${CMAKE_CURRENT_LIST_DIR}/../.."
            RESULT_VARIABLE _simcore_patch_result
            OUTPUT_VARIABLE _simcore_patch_output
            ERROR_VARIABLE _simcore_patch_error)
        if(NOT _simcore_patch_result EQUAL 0)
            message(FATAL_ERROR
                "Failed to apply ${_simcore_patch_name}:\n"
                "${_simcore_patch_output}${_simcore_patch_error}")
        endif()
        message(STATUS "Applied ${_simcore_patch_name}")
    else()
        execute_process(
            COMMAND "${GIT_EXECUTABLE}" apply --reverse --check "${_simcore_lvgl_patch}"
            WORKING_DIRECTORY "${CMAKE_CURRENT_LIST_DIR}/../.."
            RESULT_VARIABLE _simcore_patch_is_applied
            OUTPUT_QUIET
            ERROR_QUIET)
        if(NOT _simcore_patch_is_applied EQUAL 0)
            message(FATAL_ERROR
                "LVGL 9.5.0 sources do not match the expected state for "
                "${_simcore_patch_name}. Remove firmware/managed_components/lvgl__lvgl and "
                "reconfigure, or review ${_simcore_lvgl_patch}.")
        endif()
        message(STATUS "${_simcore_patch_name} is already applied")
    endif()
endforeach()

unset(_simcore_lvgl_dir)
unset(_simcore_lvgl_version_header)
unset(_simcore_lvgl_patches)
unset(_simcore_lvgl_patch)
unset(_simcore_patch_name)
unset(_simcore_lvgl_version)
unset(_simcore_version_part)
unset(_simcore_version_match)
unset(_simcore_patch_can_apply)
unset(_simcore_patch_result)
unset(_simcore_patch_output)
unset(_simcore_patch_error)
unset(_simcore_patch_is_applied)
