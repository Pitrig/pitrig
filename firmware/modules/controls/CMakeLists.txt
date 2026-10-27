idf_component_register(SRCS "src/controls.cpp" "src/control_plan.cpp"
                            "src/control_presses.cpp" "src/control_watch.cpp"
                       INCLUDE_DIRS "include"
                       PRIV_INCLUDE_DIRS "src"
                       REQUIRES configuration configuration_contract event_bus telemetry
                       PRIV_REQUIRES esp_system esp_timer logger pitrig_config value_conditions)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
