idf_component_register(
  SRCS "src/simcore.cpp"
  INCLUDE_DIRS "include"
  PRIV_REQUIRES application_config board_registry configuration dashboard
                delta_time display estimated_lap_time event_bus lap_timer
                logger nvs_config_storage performance simcore_config simhub
                telemetry)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
