idf_component_register(
  SRCS "src/image_asset_control.cpp"
  INCLUDE_DIRS "include"
  REQUIRES asset_control binary_session image_assets transport
  PRIV_REQUIRES performance)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
