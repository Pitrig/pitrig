idf_component_register(SRCS "src/uart_transport.cpp"
                       INCLUDE_DIRS "include"
                       REQUIRES esp_driver_uart simcore_config transport
                       PRIV_REQUIRES performance)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
