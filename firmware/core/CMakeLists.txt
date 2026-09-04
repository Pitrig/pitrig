idf_component_register(
  SRCS "src/simcore.cpp"
       "src/simcore_boot.cpp"
       "src/apply_configuration.cpp"
  INCLUDE_DIRS "include"
  PRIV_INCLUDE_DIRS "src"
  PRIV_REQUIRES board_registry boot_guard communication configuration
                dashboard_composition
                display esp_timer event_bus external_memory firmware_update
                font_assets image_assets input logger nvs_config_storage
                partition_asset_storage status_light
                module_composition simcore_config telemetry
                telemetry_transport performance value_smoothing)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
