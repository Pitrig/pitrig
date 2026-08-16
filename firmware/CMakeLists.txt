cmake_minimum_required(VERSION 3.22)

set(IDF_TARGET "esp32s3" CACHE STRING "ESP-IDF target")
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

list(APPEND EXTRA_COMPONENT_DIRS
     "${CMAKE_CURRENT_LIST_DIR}/core"
     "${CMAKE_CURRENT_LIST_DIR}/core/module_manager"
     "${CMAKE_CURRENT_LIST_DIR}/drivers/transport/uart"
     "${CMAKE_CURRENT_LIST_DIR}/drivers/transport/usb_cdc"
     "${CMAKE_CURRENT_LIST_DIR}/interfaces"
     "${CMAKE_CURRENT_LIST_DIR}/interfaces/transport"
     "${CMAKE_CURRENT_LIST_DIR}/modules/lap_timer"
     "${CMAKE_CURRENT_LIST_DIR}/platform/board_registry"
     "${CMAKE_CURRENT_LIST_DIR}/platform/communication"
     "${CMAKE_CURRENT_LIST_DIR}/platform/dashboard"
     "${CMAKE_CURRENT_LIST_DIR}/platform/dashboard_composition"
     "${CMAKE_CURRENT_LIST_DIR}/platform/external_memory"
     "${CMAKE_CURRENT_LIST_DIR}/platform/module_composition"
     "${CMAKE_CURRENT_LIST_DIR}/platform/nvs_config_storage"
     "${CMAKE_CURRENT_LIST_DIR}/platform/partition_font_asset_storage"
     "${CMAKE_CURRENT_LIST_DIR}/platform/telemetry_transport"
     "${CMAKE_CURRENT_LIST_DIR}/services/configuration"
     "${CMAKE_CURRENT_LIST_DIR}/services/configuration_control"
     "${CMAKE_CURRENT_LIST_DIR}/services/configuration_contract"
     "${CMAKE_CURRENT_LIST_DIR}/services/event_bus"
     "${CMAKE_CURRENT_LIST_DIR}/services/font_asset_control"
     "${CMAKE_CURRENT_LIST_DIR}/services/font_assets"
     "${CMAKE_CURRENT_LIST_DIR}/services/font_contract"
     "${CMAKE_CURRENT_LIST_DIR}/services/logger"
     "${CMAKE_CURRENT_LIST_DIR}/services/performance"
     "${CMAKE_CURRENT_LIST_DIR}/services/telemetry"
     "${CMAKE_CURRENT_LIST_DIR}/services/telemetry/protocols/simhub"
     "${CMAKE_CURRENT_LIST_DIR}/utils/binary"
     "${CMAKE_CURRENT_LIST_DIR}/utils/transformers/number_transform"
     "${CMAKE_CURRENT_LIST_DIR}/utils/transformers/text_writer"
     "${CMAKE_CURRENT_LIST_DIR}/utils/transformers/time_transform")

if(IDF_TARGET STREQUAL "esp32p4")
    list(APPEND EXTRA_COMPONENT_DIRS
         "${CMAKE_CURRENT_LIST_DIR}/drivers/guition_jc1060p470c")
else()
    list(APPEND EXTRA_COMPONENT_DIRS
         "${CMAKE_CURRENT_LIST_DIR}/drivers/guition_esp32_4848s040"
         "${CMAKE_CURRENT_LIST_DIR}/drivers/t_display_s3")
endif()

include($ENV{IDF_PATH}/tools/cmake/project.cmake)
if(IDF_TARGET STREQUAL "esp32p4")
    idf_build_set_property(DEPENDENCIES_LOCK dependencies.lock.esp32p4)
endif()
idf_build_set_property(MINIMAL_BUILD ON)
project(simcore)

if(IDF_TARGET STREQUAL "esp32p4")
    include("${CMAKE_CURRENT_LIST_DIR}/cmake/apply_lvgl_ppa_patch.cmake")
    include("${CMAKE_CURRENT_LIST_DIR}/cmake/apply_esp_lvgl_port_dsi_patch.cmake")
endif()
