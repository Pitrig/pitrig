idf_component_register(
  SRCS "src/font_asset_control.cpp"
  INCLUDE_DIRS "include"
  REQUIRES font_assets transport
  PRIV_REQUIRES freertos)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
