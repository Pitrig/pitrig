idf_component_register(SRCS "src/font_asset_crc.cpp" "src/font_asset_service.cpp"
                       INCLUDE_DIRS "include")

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
