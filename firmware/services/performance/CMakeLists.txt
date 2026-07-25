idf_component_register(SRCS "src/performance.cpp"
                       INCLUDE_DIRS "include"
                       PRIV_REQUIRES esp_timer freertos heap logger)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
