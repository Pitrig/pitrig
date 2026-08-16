idf_component_register(
  SRCS "src/image_asset_control.cpp"
  INCLUDE_DIRS "include"
  REQUIRES binary_session image_assets freertos transport
  PRIV_REQUIRES binary performance simcore_config)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
