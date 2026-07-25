idf_component_register(SRCS "src/usb_cdc_transport.cpp"
                       INCLUDE_DIRS "include"
                       REQUIRES transport esp_tinyusb)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
