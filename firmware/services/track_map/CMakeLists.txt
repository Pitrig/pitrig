idf_component_register(SRCS "src/outline_decoder.cpp"
                            "src/track_map.cpp"
                       INCLUDE_DIRS "include"
                       PRIV_INCLUDE_DIRS "src"
                       REQUIRES event_bus telemetry)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
