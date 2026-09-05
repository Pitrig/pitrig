idf_component_register(SRCS "src/usb_cdc_transport.cpp"
                            "src/usb_descriptors.cpp"
                            "src/usb_gamepad.cpp"
                       INCLUDE_DIRS "include"
                       REQUIRES esp_tinyusb pitrig_config transport transport_common)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)

if(CONFIG_TINYUSB_HID_COUNT GREATER 0)
    foreach(symbol tud_hid_descriptor_report_cb tud_hid_get_report_cb
                   tud_hid_set_report_cb)
        set_property(TARGET ${COMPONENT_LIB} APPEND PROPERTY
                     INTERFACE_LINK_LIBRARIES "-u ${symbol}")
    endforeach()
endif()
