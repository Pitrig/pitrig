idf_component_register(
  SRCS "src/pitrig.cpp"
       "src/pitrig_boot.cpp"
       "src/apply_configuration.cpp"
  INCLUDE_DIRS "include"
  PRIV_INCLUDE_DIRS "src"
  PRIV_REQUIRES board_registry boot_guard communication configuration
                configuration_contract dashboard_composition
                display esp_timer event_bus external_memory firmware_update
                font_assets image_assets input logger nvs_config_storage
                partition_asset_storage
                module_composition pitrig_config telemetry
                telemetry_transport performance value_smoothing)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
