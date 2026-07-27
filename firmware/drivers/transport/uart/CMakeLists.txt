idf_component_register(SRCS "src/uart_transport.cpp"
                       INCLUDE_DIRS "include"
                       REQUIRES esp_driver_uart transport)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
