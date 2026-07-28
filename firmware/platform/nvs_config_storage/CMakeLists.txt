idf_component_register(SRCS "src/nvs_config_storage.cpp"
                       INCLUDE_DIRS "include"
                       REQUIRES configuration nvs_flash)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
