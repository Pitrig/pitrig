idf_component_register(SRCS "src/boot_guard.cpp"
                       INCLUDE_DIRS "include"
                       PRIV_REQUIRES esp_timer freertos logger pitrig_config)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
