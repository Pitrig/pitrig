idf_component_register(SRCS "src/font_asset_service.cpp"
                       INCLUDE_DIRS "include"
                       REQUIRES font_contract
                       PRIV_REQUIRES binary)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
