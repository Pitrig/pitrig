idf_component_register(SRCS "src/asset_package.cpp"
                            "src/asset_slot.cpp"
                       INCLUDE_DIRS "include"
                       REQUIRES asset_storage freertos
                       PRIV_REQUIRES binary)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
