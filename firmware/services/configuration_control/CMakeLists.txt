idf_component_register(
    SRCS "src/configuration_control.cpp"
         "src/configuration_control_commands.cpp"
         "src/configuration_control_diagnostics.cpp"
         "src/configuration_control_info.cpp"
    INCLUDE_DIRS "include"
    REQUIRES configuration freertos transport
    PRIV_REQUIRES boot_guard diagnostics_command esp_app_format performance
                  pitrig_config)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
