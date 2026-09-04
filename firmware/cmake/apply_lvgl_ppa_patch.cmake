include("${CMAKE_CURRENT_LIST_DIR}/apply_patch_stack.cmake")

set(_simcore_lvgl_dir "${CMAKE_CURRENT_LIST_DIR}/../managed_components/lvgl__lvgl")
set(_simcore_lvgl_version_header "${_simcore_lvgl_dir}/lv_version.h")
set(_simcore_lvgl_patches
    "${CMAKE_CURRENT_LIST_DIR}/../patches/lvgl-9.5.0-ppa-draw-buffer-size-alignment.patch"
    "${CMAKE_CURRENT_LIST_DIR}/../patches/lvgl-9.5.0-ppa-area-cache-sync.patch"
    "${CMAKE_CURRENT_LIST_DIR}/../patches/lvgl-9.5.0-ppa-small-fill-threshold.patch")

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

simcore_apply_patch_stack("LVGL 9.5.0" "${_simcore_lvgl_dir}" ${_simcore_lvgl_patches})

unset(_simcore_lvgl_dir)
unset(_simcore_lvgl_version_header)
unset(_simcore_lvgl_patches)
unset(_simcore_lvgl_version)
unset(_simcore_version_part)
unset(_simcore_version_match)
