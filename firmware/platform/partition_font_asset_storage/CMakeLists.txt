idf_component_register(
  SRCS "src/partition_font_asset_storage.cpp"
  INCLUDE_DIRS "include"
  REQUIRES esp_partition font_assets)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
