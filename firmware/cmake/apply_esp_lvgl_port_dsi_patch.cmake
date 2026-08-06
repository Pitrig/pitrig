# esp_lvgl_port 2.8.0 does not place its MIPI-DSI refresh callback in IRAM
# when CONFIG_LCD_DSI_ISR_CACHE_SAFE is enabled. Keep this workaround pinned so
# a component update cannot silently receive a stale patch.
set(_simcore_port_dir
    "${CMAKE_CURRENT_LIST_DIR}/../managed_components/espressif__esp_lvgl_port")
set(_simcore_port_manifest "${_simcore_port_dir}/idf_component.yml")
set(_simcore_port_patch
    "${CMAKE_CURRENT_LIST_DIR}/../patches/esp-lvgl-port-2.8.0-dsi-cache-safe-callback.patch")
set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS "${_simcore_port_patch}")

if(NOT EXISTS "${_simcore_port_manifest}")
    message(FATAL_ERROR
        "esp_lvgl_port was not resolved before applying the ESP32-P4 DSI patch")
endif()

file(READ "${_simcore_port_manifest}" _simcore_port_manifest_contents)
string(FIND "${_simcore_port_manifest_contents}" "version: 2.8.0~1"
       _simcore_port_version_match)
if(_simcore_port_version_match EQUAL -1)
    message(FATAL_ERROR
        "The DSI cache-safe callback patch supports only esp_lvgl_port 2.8.0~1. "
        "Review or remove ${_simcore_port_patch} before building this version.")
endif()

find_package(Git REQUIRED)

execute_process(
    COMMAND "${GIT_EXECUTABLE}" apply --check "${_simcore_port_patch}"
    WORKING_DIRECTORY "${CMAKE_CURRENT_LIST_DIR}/../.."
    RESULT_VARIABLE _simcore_port_patch_can_apply
    OUTPUT_QUIET
    ERROR_QUIET)

if(_simcore_port_patch_can_apply EQUAL 0)
    execute_process(
        COMMAND "${GIT_EXECUTABLE}" apply "${_simcore_port_patch}"
        WORKING_DIRECTORY "${CMAKE_CURRENT_LIST_DIR}/../.."
        RESULT_VARIABLE _simcore_port_patch_result
        OUTPUT_VARIABLE _simcore_port_patch_output
        ERROR_VARIABLE _simcore_port_patch_error)
    if(NOT _simcore_port_patch_result EQUAL 0)
        message(FATAL_ERROR
            "Failed to apply the esp_lvgl_port ESP32-P4 DSI patch:\n"
            "${_simcore_port_patch_output}${_simcore_port_patch_error}")
    endif()
    message(STATUS "Applied esp_lvgl_port 2.8.0 ESP32-P4 DSI cache-safe callback patch")
else()
    execute_process(
        COMMAND "${GIT_EXECUTABLE}" apply --reverse --check "${_simcore_port_patch}"
        WORKING_DIRECTORY "${CMAKE_CURRENT_LIST_DIR}/../.."
        RESULT_VARIABLE _simcore_port_patch_is_applied
        OUTPUT_QUIET
        ERROR_QUIET)
    if(NOT _simcore_port_patch_is_applied EQUAL 0)
        message(FATAL_ERROR
            "esp_lvgl_port 2.8.0 sources do not match the expected DSI patch state. "
            "Remove firmware/managed_components/espressif__esp_lvgl_port and "
            "reconfigure, or review ${_simcore_port_patch}.")
    endif()
    message(STATUS
        "esp_lvgl_port 2.8.0 ESP32-P4 DSI cache-safe callback patch is already applied")
endif()

unset(_simcore_port_dir)
unset(_simcore_port_manifest)
unset(_simcore_port_patch)
unset(_simcore_port_manifest_contents)
unset(_simcore_port_version_match)
unset(_simcore_port_patch_can_apply)
unset(_simcore_port_patch_result)
unset(_simcore_port_patch_output)
unset(_simcore_port_patch_error)
unset(_simcore_port_patch_is_applied)
