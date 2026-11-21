idf_component_register(SRCS "src/usb_serial_jtag_transport.cpp"
                       INCLUDE_DIRS "include"
                       REQUIRES pitrig_config transport transport_common
                       PRIV_REQUIRES esp_driver_usb_serial_jtag)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
