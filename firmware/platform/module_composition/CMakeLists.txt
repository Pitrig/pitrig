idf_component_register(
  SRCS "src/module_composition.cpp"
  INCLUDE_DIRS "include"
  REQUIRES configuration_contract event_bus interfaces lap_timer
           module_manager rgb_leds
           telemetry
  PRIV_REQUIRES logger simcore_config)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
