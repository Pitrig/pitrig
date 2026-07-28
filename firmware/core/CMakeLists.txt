idf_component_register(
  SRCS "src/simcore.cpp"
  INCLUDE_DIRS "include"
  PRIV_REQUIRES application_config board_registry configuration display event_bus
                logger nvs_config_storage performance runtime_composition
                simcore_config simhub telemetry)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
