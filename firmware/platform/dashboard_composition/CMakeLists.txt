idf_component_register(
  SRCS "src/dashboard_composition.cpp"
  INCLUDE_DIRS "include"
  REQUIRES configuration_contract dashboard font_assets module_composition
           telemetry transport
  PRIV_REQUIRES logger simcore_config)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
