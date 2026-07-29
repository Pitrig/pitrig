idf_component_register(
  SRCS "src/runtime_composition.cpp"
  INCLUDE_DIRS "include"
  REQUIRES application_config dashboard delta_time event_bus lap_timer telemetry
           transport
  PRIV_REQUIRES dashboard logger simcore_config)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
