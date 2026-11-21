idf_component_register(SRCS "src/outline_decoder.cpp"
                            "src/track_map.cpp"
                       INCLUDE_DIRS "include"
                       PRIV_INCLUDE_DIRS "src"
                       REQUIRES event_bus telemetry
                       PRIV_REQUIRES esp_timer value_smoothing)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
