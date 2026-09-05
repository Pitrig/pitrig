idf_component_register(
  SRCS "src/font_asset_control.cpp"
  INCLUDE_DIRS "include"
  REQUIRES asset_control binary_session font_assets
  PRIV_REQUIRES performance pitrig_config)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
