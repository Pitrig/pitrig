idf_component_register(
  SRCS "src/application_configuration.cpp"
  INCLUDE_DIRS "include"
  REQUIRES font_contract time_transform)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
