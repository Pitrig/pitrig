idf_component_register(SRCS "src/transport_instrumentation.cpp"
                       INCLUDE_DIRS "include"
                       REQUIRES esp_system freertos transport
                       PRIV_REQUIRES esp_timer log performance simcore_config)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
