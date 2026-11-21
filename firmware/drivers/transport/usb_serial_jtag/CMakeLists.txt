set(fallback_sources "")
set(fallback_includes "")
if(CONFIG_PITRIG_USB_SERIAL_JTAG_FALLBACK)
    set(fallback_sources "src/usb_serial_jtag_transport.cpp")
    set(fallback_includes "include")
endif()

idf_component_register(SRCS ${fallback_sources}
                       INCLUDE_DIRS ${fallback_includes}
                       REQUIRES pitrig_config transport transport_common
                       PRIV_REQUIRES esp_driver_usb_serial_jtag)

if(fallback_sources)
    target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
endif()
