idf_component_register(SRCS "src/asset_package.cpp"
                       INCLUDE_DIRS "include"
                       REQUIRES asset_storage
                       PRIV_REQUIRES binary)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
