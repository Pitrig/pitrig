include("${CMAKE_CURRENT_LIST_DIR}/apply_patch_stack.cmake")

set(_pitrig_lvgl_dir "${CMAKE_CURRENT_LIST_DIR}/../managed_components/lvgl__lvgl")
set(_pitrig_lvgl_version_header "${_pitrig_lvgl_dir}/lv_version.h")
set(_pitrig_lvgl_patches
    "${CMAKE_CURRENT_LIST_DIR}/../patches/lvgl-9.5.0-ppa-draw-buffer-size-alignment.patch"
    "${CMAKE_CURRENT_LIST_DIR}/../patches/lvgl-9.5.0-ppa-area-cache-sync.patch"
    "${CMAKE_CURRENT_LIST_DIR}/../patches/lvgl-9.5.0-ppa-small-fill-threshold.patch")

if(NOT EXISTS "${_pitrig_lvgl_version_header}")
    message(FATAL_ERROR
        "LVGL managed component was not resolved before applying the ESP32-P4 PPA patches")
endif()

file(READ "${_pitrig_lvgl_version_header}" _pitrig_lvgl_version)
foreach(_pitrig_version_part IN ITEMS
        "LVGL_VERSION_MAJOR 9"
        "LVGL_VERSION_MINOR 5"
        "LVGL_VERSION_PATCH 0")
    string(FIND "${_pitrig_lvgl_version}" "${_pitrig_version_part}" _pitrig_version_match)
    if(_pitrig_version_match EQUAL -1)
        message(FATAL_ERROR
            "The ESP32-P4 PPA patches support only LVGL 9.5.0. "
            "Review or remove them under firmware/patches before building this LVGL version.")
    endif()
endforeach()

pitrig_apply_patch_stack("LVGL 9.5.0" "${_pitrig_lvgl_dir}" ${_pitrig_lvgl_patches})

unset(_pitrig_lvgl_dir)
unset(_pitrig_lvgl_version_header)
unset(_pitrig_lvgl_patches)
unset(_pitrig_lvgl_version)
unset(_pitrig_version_part)
unset(_pitrig_version_match)
