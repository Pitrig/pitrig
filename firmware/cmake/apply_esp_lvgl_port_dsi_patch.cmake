include("${CMAKE_CURRENT_LIST_DIR}/apply_patch_stack.cmake")

set(_pitrig_port_dir
    "${CMAKE_CURRENT_LIST_DIR}/../managed_components/espressif__esp_lvgl_port")
set(_pitrig_port_manifest "${_pitrig_port_dir}/idf_component.yml")
set(_pitrig_port_patches
    "${CMAKE_CURRENT_LIST_DIR}/../patches/esp-lvgl-port-2.8.0-dsi-cache-safe-flush.patch"
    "${CMAKE_CURRENT_LIST_DIR}/../patches/esp-lvgl-port-2.8.0-flush-worker.patch"
    "${CMAKE_CURRENT_LIST_DIR}/../patches/esp-lvgl-port-2.8.0-tear-free-switch.patch"
    "${CMAKE_CURRENT_LIST_DIR}/../patches/esp-lvgl-port-2.8.0-dsi-triple-buffer.patch"
    "${CMAKE_CURRENT_LIST_DIR}/../patches/esp-lvgl-port-2.8.0-dsi-full-strips.patch"
    "${CMAKE_CURRENT_LIST_DIR}/../patches/esp-lvgl-port-2.8.0-full-strips-mode-economics.patch"
    "${CMAKE_CURRENT_LIST_DIR}/../patches/esp-lvgl-port-2.8.0-uncapped.patch"
    "${CMAKE_CURRENT_LIST_DIR}/../patches/esp-lvgl-port-2.8.0-jit-frame-start.patch"
    "${CMAKE_CURRENT_LIST_DIR}/../patches/esp-lvgl-port-2.8.0-burst-scheduled-frames.patch")

if(NOT EXISTS "${_pitrig_port_manifest}")
    message(FATAL_ERROR
        "esp_lvgl_port was not resolved before applying the esp_lvgl_port patches")
endif()

file(READ "${_pitrig_port_manifest}" _pitrig_port_manifest_contents)
string(FIND "${_pitrig_port_manifest_contents}" "version: 2.8.0~1"
       _pitrig_port_version_match)
if(_pitrig_port_version_match EQUAL -1)
    message(FATAL_ERROR
        "The esp_lvgl_port patches support only esp_lvgl_port 2.8.0~1. "
        "Review or remove them under firmware/patches before building this version.")
endif()

pitrig_apply_patch_stack("esp_lvgl_port 2.8.0" "${_pitrig_port_dir}" ${_pitrig_port_patches})

unset(_pitrig_port_dir)
unset(_pitrig_port_manifest)
unset(_pitrig_port_patches)
unset(_pitrig_port_manifest_contents)
unset(_pitrig_port_version_match)
