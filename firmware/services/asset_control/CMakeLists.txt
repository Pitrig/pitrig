idf_component_register(
  SRCS "src/asset_control.cpp"
       "src/asset_control_worker.cpp"
       "src/asset_replies.cpp"
  INCLUDE_DIRS "include"
  PRIV_INCLUDE_DIRS "src"
  REQUIRES binary_session freertos performance pitrig_config transport
  PRIV_REQUIRES binary)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
