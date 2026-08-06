# LVGL 9.5.0's experimental PPA backend passes draw_buf->data_size to
# esp_cache_msync() and PPA. Dynamically allocated draw buffers align their
# address, but not their size, which violates the ESP32-P4 cache-line contract.
# Keep this workaround version-pinned so an LVGL update cannot silently receive
# a stale patch.
set(_simcore_lvgl_dir "${CMAKE_CURRENT_LIST_DIR}/../managed_components/lvgl__lvgl")
set(_simcore_lvgl_version_header "${_simcore_lvgl_dir}/lv_version.h")
set(_simcore_lvgl_patch
    "${CMAKE_CURRENT_LIST_DIR}/../patches/lvgl-9.5.0-ppa-draw-buffer-size-alignment.patch")
set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS "${_simcore_lvgl_patch}")

if(NOT EXISTS "${_simcore_lvgl_version_header}")
    message(FATAL_ERROR
        "LVGL managed component was not resolved before applying the ESP32-P4 PPA patch")
endif()

file(READ "${_simcore_lvgl_version_header}" _simcore_lvgl_version)
foreach(_simcore_version_part IN ITEMS
        "LVGL_VERSION_MAJOR 9"
        "LVGL_VERSION_MINOR 5"
        "LVGL_VERSION_PATCH 0")
    string(FIND "${_simcore_lvgl_version}" "${_simcore_version_part}" _simcore_version_match)
    if(_simcore_version_match EQUAL -1)
        message(FATAL_ERROR
            "The ESP32-P4 PPA draw-buffer patch supports only LVGL 9.5.0. "
            "Review or remove ${_simcore_lvgl_patch} before building this LVGL version.")
    endif()
endforeach()

find_package(Git REQUIRED)

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
            "Failed to apply the LVGL ESP32-P4 PPA patch:\n"
            "${_simcore_patch_output}${_simcore_patch_error}")
    endif()
    message(STATUS "Applied LVGL 9.5.0 ESP32-P4 PPA draw-buffer alignment patch")
else()
    execute_process(
        COMMAND "${GIT_EXECUTABLE}" apply --reverse --check "${_simcore_lvgl_patch}"
        WORKING_DIRECTORY "${CMAKE_CURRENT_LIST_DIR}/../.."
        RESULT_VARIABLE _simcore_patch_is_applied
        OUTPUT_QUIET
        ERROR_QUIET)
    if(NOT _simcore_patch_is_applied EQUAL 0)
        message(FATAL_ERROR
            "LVGL 9.5.0 sources do not match the expected PPA patch state. "
            "Remove firmware/managed_components/lvgl__lvgl and reconfigure, or review "
            "${_simcore_lvgl_patch}.")
    endif()
    message(STATUS "LVGL 9.5.0 ESP32-P4 PPA draw-buffer alignment patch is already applied")
endif()

unset(_simcore_lvgl_dir)
unset(_simcore_lvgl_version_header)
unset(_simcore_lvgl_patch)
unset(_simcore_lvgl_version)
unset(_simcore_version_part)
unset(_simcore_version_match)
unset(_simcore_patch_can_apply)
unset(_simcore_patch_result)
unset(_simcore_patch_output)
unset(_simcore_patch_error)
unset(_simcore_patch_is_applied)
