idf_component_register(
    SRCS "src/configuration_control.cpp"
    INCLUDE_DIRS "include"
    REQUIRES configuration freertos transport
    PRIV_REQUIRES esp_app_format performance simcore_config)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
