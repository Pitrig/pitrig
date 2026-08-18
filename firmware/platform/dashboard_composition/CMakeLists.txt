idf_component_register(
  SRCS "src/dashboard_composition.cpp"
       "src/dashboard_assets.cpp"
       "src/dashboard_screens.cpp"
       "src/screens_overflow.cpp"
       "src/screens_z_order.cpp"
  INCLUDE_DIRS "include"
  # ITransport is only forward-declared in the public header, so the contract
  # itself is the caller's dependency rather than this component's.
  REQUIRES configuration_contract dashboard event_bus font_assets image_assets
           module_composition telemetry
  PRIV_REQUIRES display esp_lvgl_port logger lvgl__lvgl simcore_config)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
