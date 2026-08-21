idf_component_register(SRCS "src/performance.cpp"
                            "src/performance_sampler.cpp"
                       INCLUDE_DIRS "include"
                       PRIV_REQUIRES esp_timer freertos heap simcore_config)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
