idf_component_register(SRCS "src/ws2812_rmt.cpp" "src/ws2812_encoder.cpp"
                       INCLUDE_DIRS "include"
                       PRIV_INCLUDE_DIRS "src"
                       REQUIRES interfaces
                       PRIV_REQUIRES esp_driver_rmt)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
