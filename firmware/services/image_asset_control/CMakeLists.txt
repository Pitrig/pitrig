idf_component_register(
  SRCS "src/image_asset_control.cpp"
  INCLUDE_DIRS "include"
  REQUIRES asset_control binary_session image_assets
  PRIV_REQUIRES performance simcore_config)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
