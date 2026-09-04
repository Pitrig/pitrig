idf_component_register(SRCS "src/value_smoothing.cpp"
                       INCLUDE_DIRS "include"
                       REQUIRES configuration_contract event_bus telemetry
                       PRIV_REQUIRES esp_timer value_conditions)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
