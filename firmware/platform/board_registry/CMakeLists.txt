idf_component_register(SRCS "src/board_registry.cpp"
                       INCLUDE_DIRS "include"
                       REQUIRES configuration interfaces transport
                       PRIV_REQUIRES guition_esp32_4848s040 t_display_s3
                                     uart usb_cdc)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
