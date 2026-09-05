idf_component_register(SRCS "src/telemetry_provider.cpp"
                            "src/telemetry_registry.cpp"
                            "src/telemetry_state.cpp"
                       INCLUDE_DIRS "include"
                       REQUIRES event_bus pitrig_config
                       PRIV_REQUIRES esp_timer)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
