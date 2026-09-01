idf_component_register(SRCS "src/status_light.cpp"
                       INCLUDE_DIRS "include"
                       REQUIRES event_bus interfaces
                       PRIV_REQUIRES esp_timer led telemetry)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
