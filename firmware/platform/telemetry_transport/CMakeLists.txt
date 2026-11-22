set(transport_sources "src/telemetry_transport_composition.cpp")
set(transport_driver_dependencies)
if(IDF_TARGET STREQUAL "esp32p4")
    list(APPEND transport_driver_dependencies usb_cdc usb_serial_jtag)
    if(CONFIG_PITRIG_USB_SERIAL_JTAG_FALLBACK)
        list(APPEND transport_sources "src/usb_fallback_transport.cpp")
    endif()
else()
    list(APPEND transport_driver_dependencies uart usb_cdc)
endif()

idf_component_register(
    SRCS ${transport_sources}
    INCLUDE_DIRS "include"
    REQUIRES board_registry configuration_contract pitrig_config transport
    PRIV_REQUIRES esp_driver_uart ${transport_driver_dependencies})

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
