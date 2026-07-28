cmake_minimum_required(VERSION 3.22)

set(IDF_TARGET "esp32s3" CACHE STRING "ESP-IDF target")
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

list(APPEND EXTRA_COMPONENT_DIRS
     "${CMAKE_CURRENT_LIST_DIR}/core"
     "${CMAKE_CURRENT_LIST_DIR}/drivers/guition_esp32_4848s040"
     "${CMAKE_CURRENT_LIST_DIR}/drivers/t_display_s3"
     "${CMAKE_CURRENT_LIST_DIR}/drivers/transport/uart"
     "${CMAKE_CURRENT_LIST_DIR}/drivers/transport/usb_cdc"
     "${CMAKE_CURRENT_LIST_DIR}/interfaces"
     "${CMAKE_CURRENT_LIST_DIR}/interfaces/transport"
     "${CMAKE_CURRENT_LIST_DIR}/modules/delta_time"
     "${CMAKE_CURRENT_LIST_DIR}/modules/estimated_lap_time"
     "${CMAKE_CURRENT_LIST_DIR}/modules/lap_timer"
     "${CMAKE_CURRENT_LIST_DIR}/platform/application_config"
     "${CMAKE_CURRENT_LIST_DIR}/platform/board_registry"
     "${CMAKE_CURRENT_LIST_DIR}/platform/dashboard"
     "${CMAKE_CURRENT_LIST_DIR}/platform/nvs_config_storage"
     "${CMAKE_CURRENT_LIST_DIR}/services/configuration"
     "${CMAKE_CURRENT_LIST_DIR}/services/event_bus"
     "${CMAKE_CURRENT_LIST_DIR}/services/logger"
     "${CMAKE_CURRENT_LIST_DIR}/services/performance"
     "${CMAKE_CURRENT_LIST_DIR}/services/telemetry"
     "${CMAKE_CURRENT_LIST_DIR}/services/telemetry/protocols/simhub")

include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(simcore)
