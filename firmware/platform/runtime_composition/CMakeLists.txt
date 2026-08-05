idf_component_register(
  SRCS "src/runtime_composition.cpp"
  INCLUDE_DIRS "include"
  REQUIRES configuration dashboard delta_time event_bus font_assets
           lap_timer module_manager telemetry transport
  PRIV_REQUIRES dashboard logger simcore_config)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
