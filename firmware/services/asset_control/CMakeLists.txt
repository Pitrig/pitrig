idf_component_register(
  SRCS "src/asset_control.cpp"
  INCLUDE_DIRS "include"
  REQUIRES binary_session freertos performance transport
  PRIV_REQUIRES binary simcore_config)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
