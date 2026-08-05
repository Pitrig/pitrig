idf_component_register(SRCS "src/lap_timer.cpp"
                       INCLUDE_DIRS "include"
                       REQUIRES configuration event_bus telemetry)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
