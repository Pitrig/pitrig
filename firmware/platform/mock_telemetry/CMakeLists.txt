idf_component_register(SRCS "src/mock_telemetry.cpp"
                       INCLUDE_DIRS "include"
                       PRIV_REQUIRES esp_timer lap_timer)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
