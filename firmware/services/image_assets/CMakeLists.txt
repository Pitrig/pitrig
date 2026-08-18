idf_component_register(SRCS "src/image_asset_service.cpp"
                            "src/image_manifest.cpp"
                       INCLUDE_DIRS "include"
                       REQUIRES asset_package asset_storage image_contract
                       PRIV_REQUIRES binary)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
